import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ViettelService } from "./services/ViettelService.js";


@Module({
    providers: [
        ViettelService
    ]
})
export class AppModule { }


const app = await NestFactory.createApplicationContext(AppModule)
await app.init()