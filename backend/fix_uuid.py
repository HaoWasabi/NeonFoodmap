from django.db import connection

sql = """
SET FOREIGN_KEY_CHECKS=0;
UPDATE partner_premium_purchases SET id = RPAD(REPLACE(id, '-', ''), 32, '0');
UPDATE partner_premium_purchases SET invoice_id = RPAD(REPLACE(invoice_id, '-', ''), 32, '0') WHERE invoice_id IS NOT NULL;
UPDATE tour_purchases SET id = RPAD(REPLACE(id, '-', ''), 32, '0');
UPDATE tour_purchases SET invoice_id = RPAD(REPLACE(invoice_id, '-', ''), 32, '0') WHERE invoice_id IS NOT NULL;
UPDATE invoices SET id = RPAD(REPLACE(id, '-', ''), 32, '0');
SET FOREIGN_KEY_CHECKS=1;
"""

with connection.cursor() as cursor:
    for stmt in sql.strip().split(';'):
        if stmt.strip():
            cursor.execute(stmt)
print("SQL DB fixed!")
