-- CreateTable
CREATE TABLE "interview_reports" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "skill_notes" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "model_used" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_reports_interview_id_key" ON "interview_reports"("interview_id");

-- AddForeignKey
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

