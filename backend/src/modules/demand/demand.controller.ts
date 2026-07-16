import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AppendDemandFollowUpInputSchema,
  ConvertDemandRequestInputSchema,
  CreateDemandRequestInputSchema,
  DEMAND_CONVERSION_CAPABILITIES,
  DemandListQuerySchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  TransitionDemandStatusInputSchema,
  UpdateDemandRequestInputSchema,
  type AppendDemandFollowUpData,
  type AppendDemandFollowUpResult,
  type ConvertDemandRequestData,
  type CreateDemandRequestData,
  type DemandConversionCapability,
  type DemandConversionResult,
  type DemandListQuery,
  type DemandListResult,
  type DemandRequestDetail,
  type DemandStatusTransitionResult,
  type TransitionDemandStatusData,
  type UpdateDemandRequestData,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { DemandService, type DemandActorContext } from "./demand.service";

const uuidParam = new ZodValidationPipe(z.uuid());

export function demandActorContext(request: Request): DemandActorContext {
  const current = request.auth?.current;
  if (current === undefined) {
    throw new DomainError(
      ERROR_CODES.AUTH_REQUIRED,
      "Authentication is required",
    );
  }
  const branchWide = current.scopes.some(
    (scope) =>
      scope.branchId === current.branch.id && scope.locationId === null,
  );
  return {
    organizationId: current.organization.id,
    branchId: current.branch.id,
    actorUserId: current.user.id,
    actorFullName: current.user.fullName,
    allowedLocationIds: branchWide
      ? null
      : [
          ...new Set(
            current.scopes.flatMap((scope) =>
              scope.branchId === current.branch.id && scope.locationId !== null
                ? [scope.locationId]
                : [],
            ),
          ),
        ].sort(),
    permissions: current.permissions,
    metadata: authRequestMetadata(request),
  };
}

@ApiTags("Demand")
@Controller("demand")
export class DemandController {
  constructor(private readonly demand: DemandService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DEMAND_VIEW)
  @ApiOperation({ summary: "List scoped customer demand with prototype KPIs" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(DemandListQuerySchema)) query: DemandListQuery,
  ): Promise<DemandListResult> {
    return this.demand.list(demandActorContext(request), query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEMAND_CREATE)
  @ApiOperation({ summary: "Capture matched or unmatched customer demand" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateDemandRequestInputSchema))
    input: CreateDemandRequestData,
  ): Promise<DemandRequestDetail> {
    return this.demand.create(demandActorContext(request), input);
  }

  @Get("conversion-capabilities")
  @RequirePermissions(PERMISSIONS.DEMAND_VIEW)
  @ApiOperation({ summary: "Read honest Demand conversion capabilities" })
  conversionCapabilities(): readonly DemandConversionCapability[] {
    return DEMAND_CONVERSION_CAPABILITIES;
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.DEMAND_VIEW)
  @ApiOperation({ summary: "Read one scoped request and append-only history" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<DemandRequestDetail> {
    return this.demand.detail(demandActorContext(request), id);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.DEMAND_MANAGE, PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({
    summary: "Replace mutable Demand fields without rewriting capture evidence",
  })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateDemandRequestInputSchema))
    input: UpdateDemandRequestData,
  ): Promise<DemandRequestDetail> {
    return this.demand.update(demandActorContext(request), id, input);
  }

  @Post(":id/status")
  @RequirePermissions(PERMISSIONS.DEMAND_MANAGE)
  @ApiOperation({ summary: "Apply an audited, versioned Demand status change" })
  transition(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(TransitionDemandStatusInputSchema))
    input: TransitionDemandStatusData,
  ): Promise<DemandStatusTransitionResult> {
    return this.demand.transition(demandActorContext(request), id, input);
  }

  @Post(":id/follow-ups")
  @RequirePermissions(PERMISSIONS.DEMAND_MANAGE, PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({
    summary: "Append contact/reminder evidence without rewriting history",
  })
  followUp(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(AppendDemandFollowUpInputSchema))
    input: AppendDemandFollowUpData,
  ): Promise<AppendDemandFollowUpResult> {
    return this.demand.appendFollowUp(demandActorContext(request), id, input);
  }

  @Post(":id/convert")
  @RequirePermissions(PERMISSIONS.DEMAND_MANAGE)
  @ApiOperation({
    summary: "Atomically link Demand to an existing posted sale",
  })
  convert(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(ConvertDemandRequestInputSchema))
    input: ConvertDemandRequestData,
  ): Promise<DemandConversionResult> {
    return this.demand.convert(demandActorContext(request), id, input);
  }
}
