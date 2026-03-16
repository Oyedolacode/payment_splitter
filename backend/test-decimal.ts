
import { Prisma } from '@prisma/client'

const mockEntry = {
  id: '123',
  debit: new Prisma.Decimal(100.50),
  credit: new Prisma.Decimal(0),
  createdAt: new Date()
}

try {
  console.log('Testing JSON.stringify on Prisma.Decimal...')
  const json = JSON.stringify(mockEntry)
  console.log('Result:', json)
} catch (err) {
  console.error('Failed to stringify:', err)
}
