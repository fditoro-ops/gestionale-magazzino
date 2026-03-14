import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "../lib/permissions.js";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET mancante");
}

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string | null;
  lastName?: string | null;
};

export type AuthRequest = Request & {
  user?: AuthUser;
};

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  firstName?: string | null;
  lastName?: string | null;
};

export function signAuthToken(user: AuthUser) {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    },
    JWT_SECRET as string,
    { expiresIn } as SignOptions
  );
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Token mancante" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as JwtPayload;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
    };

    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token non valido" });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ ok: false, error: "Utente non autenticato" });
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ ok: false, error: "Permessi insufficienti" });
    }

    next();
  };
}
