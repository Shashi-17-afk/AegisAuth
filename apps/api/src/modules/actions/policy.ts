import type { ActionType, OrganizationRole } from "@aegisauth/database";
import { AppError } from "../../lib/errors.js";

/** Roles permitted to request each implemented action type. */
const ACTION_ROLE_POLICY: Record<ActionType, OrganizationRole[]> = {
  DELETE_APPLICATION: ["OWNER", "ADMIN"],
  ROTATE_APPLICATION_SECRET: ["OWNER", "ADMIN"],
  CHANGE_MEMBER_ROLE: ["OWNER"],
  REMOVE_MEMBER: ["OWNER", "ADMIN"],
  EXPORT_SENSITIVE_DATA: ["OWNER", "ADMIN"],
};

export function assertCanRequestAction(
  actionType: ActionType,
  role: OrganizationRole,
): void {
  const allowed = ACTION_ROLE_POLICY[actionType];
  if (!allowed.includes(role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Your role is not permitted to request this action",
    );
  }
}

/** Actions implemented end-to-end in Phase 4. */
export const IMPLEMENTED_ACTION_TYPES: ActionType[] = ["DELETE_APPLICATION"];

export function assertActionImplemented(actionType: ActionType): void {
  if (!IMPLEMENTED_ACTION_TYPES.includes(actionType)) {
    throw new AppError(
      422,
      "ACTION_NOT_IMPLEMENTED",
      "This action type is defined but not implemented in Phase 4",
    );
  }
}
