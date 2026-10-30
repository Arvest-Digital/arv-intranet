-- org module: the single company-wide public-holiday list (US-09).

CREATE SCHEMA IF NOT EXISTS org;

CREATE TABLE IF NOT EXISTS org.public_holidays (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    holiday_date  DATE         NOT NULL,
    name          VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One list, one entry per date; also serves "holidays in a period" range reads.
CREATE UNIQUE INDEX IF NOT EXISTS public_holidays_holiday_date_unique ON org.public_holidays (holiday_date);
