// Seed database with initial roles only
// Commodities and locations will come from FIO API integration
import { db, roles } from './index'
import postgres from 'postgres'

// Initial roles for the application
const ROLES_DATA = [
  { id: 'applicant', name: 'Applicant' },
  { id: 'member', name: 'Member' },
  { id: 'lead', name: 'Lead' },
  { id: 'trade-partner', name: 'Trade Partner' },
  { id: 'administrator', name: 'Administrator' },
]

async function seed() {
  console.log('🌱 Seeding database...')

  try {
    // Seed roles
    console.log('📝 Seeding roles...')
    await db.insert(roles).values(ROLES_DATA).onConflictDoNothing()
    console.log(`✅ Seeded ${ROLES_DATA.length} roles`)

    console.log('✨ Database seeding complete!')
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  } finally {
    // Close the connection
    await postgres(process.env.DATABASE_URL!).end()
  }
}

seed()
