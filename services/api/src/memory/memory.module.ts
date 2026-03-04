import { Module } from "@nestjs/common";
import { MemoryController } from "./memory.controller";
import { MemoryRepository } from "./memory.repository";
import { MemoryService } from "./memory.service";
import { MemoryExtractionService } from "./memory-extraction.service";

@Module({
	controllers: [MemoryController],
	providers: [MemoryService, MemoryExtractionService, MemoryRepository],
	exports: [MemoryService],
})
export class MemoryModule {}
