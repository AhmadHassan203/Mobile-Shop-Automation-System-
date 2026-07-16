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
  CreateCustomerInputSchema,
  CustomerListQuerySchema,
  CustomerVersionInputSchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  UpdateCustomerInputSchema,
  type CreateCustomerData,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerPage,
  type CustomerVersionData,
  type UpdateCustomerData,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import {
  CustomersService,
  type CustomerActorContext,
} from "./customers.service";

const uuidParam = new ZodValidationPipe(z.uuid());

export function customerActorContext(request: Request): CustomerActorContext {
  const current = request.auth?.current;
  if (current === undefined) {
    throw new DomainError(
      ERROR_CODES.AUTH_REQUIRED,
      "Authentication is required",
    );
  }
  return {
    organizationId: current.organization.id,
    branchId: current.branch.id,
    actorUserId: current.user.id,
    canViewSensitive: current.permissions.includes(
      PERMISSIONS.CUSTOMERS_VIEW_SENSITIVE,
    ),
    metadata: authRequestMetadata(request),
  };
}

@ApiTags("Customers")
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: "List organization customers for the counter" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(CustomerListQuerySchema))
    query: CustomerListQuery,
  ): Promise<CustomerPage> {
    return this.customers.list(customerActorContext(request), query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: "Register a customer" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateCustomerInputSchema)) input: CreateCustomerData,
  ): Promise<CustomerDetail> {
    return this.customers.create(customerActorContext(request), input);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: "Read one organization customer" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<CustomerDetail> {
    return this.customers.detail(customerActorContext(request), id);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: "Update a customer with optimistic concurrency" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateCustomerInputSchema)) input: UpdateCustomerData,
  ): Promise<CustomerDetail> {
    return this.customers.update(customerActorContext(request), id, input);
  }

  @Post(":id/deactivate")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: "Deactivate a customer without deleting history" })
  deactivate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CustomerVersionInputSchema)) input: CustomerVersionData,
  ): Promise<CustomerDetail> {
    return this.customers.setActive(
      customerActorContext(request),
      id,
      input,
      false,
    );
  }

  @Post(":id/activate")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: "Reactivate a customer" })
  activate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CustomerVersionInputSchema)) input: CustomerVersionData,
  ): Promise<CustomerDetail> {
    return this.customers.setActive(
      customerActorContext(request),
      id,
      input,
      true,
    );
  }
}
