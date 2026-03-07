import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import type { CompanyContextService } from './company-context.service';

@ApiTags('company-context')
@Controller('company-context')
export class CompanyContextController {
  constructor(private readonly service: CompanyContextService) {}

  @Get()
  @ApiOperation({ summary: 'Get current company context state' })
  async getState(@TenantId() tenantId: string) {
    if (!tenantId) {
      return { error: { code: 'NO_TENANT', message: 'Tenant required' } };
    }
    const state = await this.service.getState(tenantId);
    return { data: state };
  }

  @Put('text')
  @ApiOperation({ summary: 'Update free-text company context' })
  async updateText(@TenantId() tenantId: string, @Body() body: { text: string }) {
    if (!tenantId) {
      return { error: { code: 'NO_TENANT', message: 'Tenant required' } };
    }
    await this.service.updateFreeText(tenantId, body.text || '');
    return { data: { success: true } };
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a company document' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadDocument(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    if (!tenantId) {
      return { error: { code: 'NO_TENANT', message: 'Tenant required' } };
    }
    if (!file) {
      return {
        error: { code: 'VALIDATION', message: 'File is required' },
      };
    }

    try {
      const doc = await this.service.uploadDocument(tenantId, file);
      return { data: doc };
    } catch (err) {
      return {
        error: {
          code: 'UPLOAD_ERROR',
          message: err instanceof Error ? err.message : 'Upload failed',
        },
      };
    }
  }

  @Delete('documents/:docId')
  @ApiOperation({ summary: 'Delete a company document' })
  async deleteDocument(@TenantId() tenantId: string, @Param('docId') docId: string) {
    if (!tenantId) {
      return { error: { code: 'NO_TENANT', message: 'Tenant required' } };
    }

    try {
      await this.service.deleteDocument(tenantId, docId);
      return { data: { success: true } };
    } catch (err) {
      return {
        error: {
          code: 'DELETE_ERROR',
          message: err instanceof Error ? err.message : 'Delete failed',
        },
      };
    }
  }

  @Post('documents/:docId/re-extract')
  @ApiOperation({ summary: 'Re-trigger fact extraction for a document' })
  async reExtract(@TenantId() tenantId: string, @Param('docId') docId: string) {
    if (!tenantId) {
      return { error: { code: 'NO_TENANT', message: 'Tenant required' } };
    }

    try {
      const doc = await this.service.reExtract(tenantId, docId);
      return { data: doc };
    } catch (err) {
      return {
        error: {
          code: 'EXTRACT_ERROR',
          message: err instanceof Error ? err.message : 'Re-extraction failed',
        },
      };
    }
  }
}
