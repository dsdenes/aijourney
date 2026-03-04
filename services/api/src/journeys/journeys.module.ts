import { Module } from "@nestjs/common";
import { JourneysController } from "./journeys.controller";
import { JourneysRepository } from "./journeys.repository";
import { JourneysService } from "./journeys.service";

@Module({
	controllers: [JourneysController],
	providers: [JourneysService, JourneysRepository],
	exports: [JourneysService, JourneysRepository],
})
export class JourneysModule {}
