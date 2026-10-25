-- CreateEnum
CREATE TYPE "interview_type" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'MIXED');

-- AlterEnum
ALTER TYPE "interview_mode" ADD VALUE 'VOICE';

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "interview_type" "interview_type" NOT NULL DEFAULT 'TECHNICAL';
