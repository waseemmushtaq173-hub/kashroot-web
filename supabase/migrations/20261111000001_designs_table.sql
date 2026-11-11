-- 20261111000001_designs_table.sql
-- 3D Design Studio: Persistence for user designs
-- Stores design parameters as JSONB with RLS for user isolation

CREATE TABLE IF NOT EXISTS "designs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('carton', 'crate', 'coldStore', 'truckLoad', 'orchardLayout')),
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "designs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE,
    CONSTRAINT "designs_user_id_type_name_key" UNIQUE ("user_id", "type", "name")
);

CREATE INDEX IF NOT EXISTS "designs_user_id_idx" ON "designs"("user_id");
CREATE INDEX IF NOT EXISTS "designs_type_idx" ON "designs"("type");
CREATE INDEX IF NOT EXISTS "designs_updated_at_idx" ON "designs"("updated_at" DESC);

-- RLS: users can only access their own designs
ALTER TABLE "designs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "designs_select_own" ON "designs"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "designs_insert_own" ON "designs"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "designs_update_own" ON "designs"
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "designs_delete_own" ON "designs"
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_designs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_designs_updated_at
    BEFORE UPDATE ON "designs"
    FOR EACH ROW
    EXECUTE FUNCTION update_designs_updated_at();