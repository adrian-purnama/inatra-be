import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by `requireAuth` after a valid Bearer JWT */
    auth?: {
      sub: string;
      email?: string;
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
      permissionIds?: string[];
      permissionKeys?: string[];
    };
  }
}
