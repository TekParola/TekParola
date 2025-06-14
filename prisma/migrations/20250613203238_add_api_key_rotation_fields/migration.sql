-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "autoRotateAfterDays" INTEGER,
ADD COLUMN     "lastRotatedAt" TIMESTAMP(3),
ADD COLUMN     "rotatedBy" TEXT,
ADD COLUMN     "scheduledRotationAt" TIMESTAMP(3);
