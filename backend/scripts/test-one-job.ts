import { PrismaClient } from '@prisma/client'
import axios from 'axios'

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})

const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597'
const API = 'http://localhost:3001'

async function main() {
  const job = await prisma.paymentJob.findFirst({
    where: { 
      firmId: FIRM_ID, 
      status: 'FAILED',
      errorMessage: { contains: 'No active split rule found for parent customer' }
    }
  })

  if (!job) {
    console.log('No failed jobs found with the rule error.')
    return
  }

  console.log(`Found failed job: ${job.id}`)
  console.log(`Error: ${job.errorMessage}`)
  
  // Retry via API
  console.log(`Retrying job ${job.id} via API...`)
  try {
    const res = await axios.post(`${API}/api/jobs/${job.id}/retry`)
    console.log(`Response: ${res.status} ${JSON.stringify(res.data)}`)
    
    // Wait a bit and check status
    console.log('Waiting 5s for processing...')
    await new Promise(r => setTimeout(r, 5000))
    
    const updatedJob = await prisma.paymentJob.findUnique({ where: { id: job.id } })
    console.log(`New Status: ${updatedJob?.status}`)
    console.log(`New Error (if any): ${updatedJob?.errorMessage}`)
  } catch (err: any) {
    console.error(`Retry failed: ${err.message}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
