-- Preserve the original locale before a reviewed AI repair. Never expose
-- administrator evidence or old article text through stations.source.
ALTER TABLE stations ADD COLUMN description_repair_journal jsonb;
