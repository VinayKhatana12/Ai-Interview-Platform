/*
  Warnings:

  - Added the required column `question_count` to the `interviews` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "question_count" INTEGER NOT NULL,
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "experience_level" TEXT;
