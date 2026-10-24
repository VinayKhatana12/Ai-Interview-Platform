-- CreateEnum
CREATE TYPE "evaluation_correctness" AS ENUM ('CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT');

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN     "correctness" "evaluation_correctness" NOT NULL DEFAULT 'PARTIALLY_CORRECT';
