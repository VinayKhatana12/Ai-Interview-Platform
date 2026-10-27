-- DropIndex
DROP INDEX "questions_interview_id_question_order_key";

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "follow_up_index" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_follow_up" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_question_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "questions_interview_id_question_order_follow_up_index_key" ON "questions"("interview_id", "question_order", "follow_up_index");

-- CreateIndex
CREATE UNIQUE INDEX "questions_parent_question_id_follow_up_index_key" ON "questions"("parent_question_id", "follow_up_index");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_parent_question_id_fkey" FOREIGN KEY ("parent_question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

