import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

@Injectable()
export class R2StorageService {
  private readonly client?: S3Client;
  private readonly bucket?: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET;
    if (accountId && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async upload(
    animalId: string,
    file: Express.Multer.File,
  ): Promise<{ photoId: string; objectKey: string }> {
    if (!this.client || !this.bucket)
      throw new ServiceUnavailableException('Upload de fotos não configurado.');
    if (file.size > MAX_IMAGE_BYTES)
      throw new BadRequestException('A imagem deve ter no máximo 8 MiB.');
    if (!SUPPORTED_TYPES.includes(file.mimetype as (typeof SUPPORTED_TYPES)[number]))
      throw new BadRequestException('Envie uma imagem JPEG, PNG ou WebP.');
    if (!this.hasValidSignature(file))
      throw new BadRequestException('O conteúdo não corresponde a uma imagem JPEG, PNG ou WebP.');

    const extension =
      file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const photoId = `${randomUUID()}.${extension}`;
    const objectKey = `animals/${animalId}/${photoId}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch {
      throw new ServiceUnavailableException('Não foi possível enviar a imagem ao Cloudflare R2.');
    }
    return { photoId, objectKey };
  }

  async getReadUrl(animalId: string, photoId: string): Promise<string> {
    if (!this.client || !this.bucket)
      throw new ServiceUnavailableException('Leitura de fotos não configurada.');
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(photoId))
      throw new BadRequestException('Identificador de foto inválido.');
    try {
      // O bucket fica privado; esta URL concede leitura somente deste objeto e expira em 15 minutos.
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: `animals/${animalId}/${photoId}` }),
        { expiresIn: 900 },
      );
    } catch {
      throw new ServiceUnavailableException('Não foi possível preparar o acesso à imagem.');
    }
  }

  async remove(objectKey: string): Promise<void> {
    if (!this.client || !this.bucket) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  private hasValidSignature(file: Express.Multer.File): boolean {
    if (file.mimetype === 'image/png') {
      return file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    if (file.mimetype === 'image/jpeg') {
      return (
        file.buffer[0] === 0xff &&
        file.buffer[1] === 0xd8 &&
        file.buffer.at(-2) === 0xff &&
        file.buffer.at(-1) === 0xd9
      );
    }
    return (
      file.buffer.toString('ascii', 0, 4) === 'RIFF' &&
      file.buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
}
