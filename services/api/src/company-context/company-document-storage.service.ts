import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class CompanyDocumentStorageService {
  private readonly logger = new Logger(CompanyDocumentStorageService.name);
  private s3: S3Client | null = null;

  constructor(private readonly configService: AppConfigService) {}

  private getClient(): S3Client {
    if (!this.s3) {
      const accessKeyId = this.configService.config.SCW_ACCESS_KEY;
      const secretAccessKey = this.configService.config.SCW_SECRET_KEY;
      const region = this.configService.config.SCW_REGION;
      const endpoint = this.configService.config.SCW_ENDPOINT || `https://s3.${region}.scw.cloud`;

      if (!accessKeyId || !secretAccessKey) {
        throw new Error('SCW_ACCESS_KEY and SCW_SECRET_KEY must be set for document storage');
      }

      this.s3 = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
    }
    return this.s3;
  }

  private get bucket(): string {
    return this.configService.config.SCW_BUCKET_NAME;
  }

  /**
   * Upload a file to Scaleway Object Storage.
   * @returns The storage key (path within the bucket).
   */
  async upload(
    tenantId: string,
    docId: string,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const key = `${tenantId}/${docId}/${filename}`;

    this.logger.log(`Uploading ${key} (${buffer.length} bytes, ${mimeType})`);

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return key;
  }

  /**
   * Download a file from Scaleway Object Storage.
   */
  async download(storageKey: string): Promise<Buffer> {
    this.logger.log(`Downloading ${storageKey}`);

    const result = await this.getClient().send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    if (!result.Body) {
      throw new Error(`Empty body for key: ${storageKey}`);
    }

    // result.Body is a ReadableStream — convert to buffer
    const chunks: Uint8Array[] = [];
    const stream = result.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Delete a file from Scaleway Object Storage.
   */
  async delete(storageKey: string): Promise<void> {
    this.logger.log(`Deleting ${storageKey}`);

    await this.getClient().send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }
}
