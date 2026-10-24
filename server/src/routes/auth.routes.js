import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginSchema, registerSchema } from "../validation/auth.js";
import { updateMeSchema } from "../validation/interviews.js";
import { login, logout, me, register, updateMe } from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, validate(updateMeSchema), updateMe);

export default router;
