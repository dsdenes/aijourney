import { Module } from "@nestjs/common";
import { MemoryController } from "./memory.controller";
import { MemoryExtractionService } from "./memory-extraction.service";
import { MemoryRepository } from "./memory.repository";
import { MemoryService } from "./memory.service";

@Module({
	controllers: [MemoryController],
	providers: [MemoryService, MemoryExtractionService, MemoryRepository],
	exports: [MemoryService],
})
export class MemoryModule {}
