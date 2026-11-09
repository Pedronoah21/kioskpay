-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('COUNTER', 'KIOSK');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'READY', 'DELIVERED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'KIOSK';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "channel" "SaleChannel" NOT NULL DEFAULT 'COUNTER',
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "orderNumber" INTEGER,
ADD COLUMN     "orderStatus" "OrderStatus",
ADD COLUMN     "readyAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_orderStatus_idx" ON "Sale"("orderStatus");
