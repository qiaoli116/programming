import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('users', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('role').notNullable(); // 'seeker' | 'employer'
    t.string('company_name'); // employers only
  });
  await db.schema.createTable('sessions', (t) => {
    t.string('id').primary();
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('expires_at').notNullable();
  });
  await db.schema.createTable('jobs', (t) => {
    t.increments('id');
    t.integer('owner_id').notNullable().references('users.id');
    t.string('title').notNullable();
    t.string('location').notNullable();
    t.string('work_type').notNullable();
    t.string('salary');
    t.text('description').notNullable();
    t.text('requirements').notNullable();
    t.string('posted_at').notNullable();
    t.index('posted_at');
  });
  await db.schema.createTable('applications', (t) => {
    t.increments('id');
    t.integer('job_id').notNullable().references('jobs.id');
    t.integer('applicant_id').notNullable().references('users.id');
    t.string('phone');
    t.text('cover_letter').notNullable();
    t.string('applied_at').notNullable();
    t.unique(['job_id', 'applicant_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  for (const table of ['applications', 'jobs', 'sessions', 'users']) await db.schema.dropTableIfExists(table);
}
