import type { ZodSchema } from "zod";
import type { Request, Response, NextFunction } from "express";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(">>> VALIDATE BODY CALLED", req.body);

    const result = schema.safeParse(req.body);

    if (!result.success) {
      console.log(">>> VALIDATION FAILED");
      return res.status(400).json({
        error: "Validation error",
        details: result.error.format(),
      });
    }

    console.log(">>> VALIDATION OK");

    req.body = result.data;
    next();
  };
}

