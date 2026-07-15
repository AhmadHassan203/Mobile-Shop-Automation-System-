import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_ROUTE = "mobileshop:is-public-route";

/** Opt a controller/handler out of the global session guard. */
export const Public = (): ClassDecorator & MethodDecorator =>
  SetMetadata(IS_PUBLIC_ROUTE, true);
