import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('profiles', (t) => {
    t.integer('user_id').primary().references('users.id').onDelete('CASCADE');
    t.text('body').notNullable();
    t.string('updated_at').notNullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('profiles');
}
