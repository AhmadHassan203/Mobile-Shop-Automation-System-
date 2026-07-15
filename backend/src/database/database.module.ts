import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/** Shared database infrastructure; domain modules consume PrismaService. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
