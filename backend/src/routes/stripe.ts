import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { prisma } from '../lib/prisma'
import { config } from '../lib/config'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

export async function stripeRoutes(fastify: FastifyInstance) {
    /**
     * POST /api/stripe/create-checkout
     * Creates a checkout session for the firm to subscribe.
     */
    fastify.post('/checkout', async (request, reply) => {
        console.log('CREATE CHECKOUT BODY:', request.body)
        const { firmId, tier } = request.body as { firmId: string, tier: string }

        if (!firmId) {
            return reply.status(400).send({ error: 'firmId is required' })
        }

        const pricing: Record<string, string> = {
            standard: process.env.STRIPE_PRICE_STANDARD || '',
            professional: process.env.STRIPE_PRICE_PROFESSIONAL || '',
            practice: process.env.STRIPE_PRICE_PRACTICE || ''
        }

        const priceId = pricing[tier.toLowerCase()] || pricing.professional

        if (!priceId) {
            return reply.status(500).send({ error: 'Stripe price ID not configured for this tier' })
        }

        const firm = await prisma.firm.findUnique({ where: { id: firmId } })
        if (!firm) {
            return reply.status(404).send({ error: 'Firm not found' })
        }

        // Check if or create Stripe customer
        let customerId = (firm as any).stripeCustomerId
        let validCustomer = false

        if (customerId) {
            try {
                const customer = await stripe.customers.retrieve(customerId)
                if (!customer.deleted) {
                    validCustomer = true
                }
            } catch (err: any) {
                fastify.log.warn(`Stripe customer ${customerId} not found or deleted! Recreating seamless customer...`)
            }
        }

        if (!validCustomer) {
            const customer = await stripe.customers.create({
                email: 'hello@divvybooks.com', // fallback for portal testing, normally firm email
                name: firm.name,
                metadata: { firmId: firm.id },
            })
            customerId = customer.id
            await prisma.firm.update({
                where: { id: firm.id },
                data: { stripeCustomerId: customerId } as any,
            })
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${config.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.FRONTEND_URL}/dashboard`,
            metadata: { firmId: firm.id, tier: tier.toUpperCase() },
            subscription_data: {
                metadata: { firmId: firm.id, tier: tier.toUpperCase() }
            }
        })

        return { url: session.url }
    })

    /**
     * POST /api/stripe/webhook
     * Processes Stripe webhook events.
     */
    fastify.post('/webhook', {
        preParsing: (request, reply, payload, done) => {
            let body = ''
            payload.on('data', (chunk) => {
                body += chunk
            })
            payload.on('end', () => {
                ; (request as any).rawBody = body
            })
            done(null, payload)
        }
    }, async (request, reply) => {
        const sig = request.headers['stripe-signature'] as string
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

        let event: Stripe.Event
        try {
            event = stripe.webhooks.constructEvent(
                (request as any).rawBody,
                sig,
                webhookSecret
            )
        } catch (err: any) {
            fastify.log.error(`Stripe Webhook Signature Error: ${err.message}`)
            return reply.status(400).send(`Webhook Error: ${err.message}`)
        }

        // 1. New subscription completed
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session
            const firmId = session.metadata?.firmId
            const tier = session.metadata?.tier || 'PROFESSIONAL'
            const subscriptionId = session.subscription as string

            if (firmId) {
                await prisma.firm.update({
                    where: { id: firmId },
                    data: {
                        isSubscribed: true,
                        plan: tier.toUpperCase(),
                        subscriptionId: subscriptionId,
                        subscriptionStatus: 'active',
                    } as any,
                })
                fastify.log.info(`Stripe: Firm ${firmId} is now subscribed to ${tier.toUpperCase()} tier.`)
            }
        }

        // 2. Subscription updated (e.g., plan change, payment success, past due)
        if (event.type === 'customer.subscription.updated') {
            const subscription = event.data.object as Stripe.Subscription
            const firmId = subscription.metadata?.firmId
            const tier = subscription.metadata?.tier
            const status = subscription.status

            if (firmId) {
                const data: any = {
                    subscriptionStatus: status,
                    isSubscribed: status === 'active' || status === 'trialing'
                }
                if (tier) data.plan = tier.toUpperCase()

                await prisma.firm.update({
                    where: { id: firmId },
                    data
                })
                fastify.log.info(`Stripe: Firm ${firmId} subscription updated to ${status}.`)
            }
        }

        // 3. Subscription deleted (cancelled)
        if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object as Stripe.Subscription
            const firmId = subscription.metadata?.firmId

            if (firmId) {
                await prisma.firm.update({
                    where: { id: firmId },
                    data: {
                        isSubscribed: false,
                        subscriptionId: null,
                        subscriptionStatus: 'canceled',
                        plan: 'STANDARD' // Revert to standard on cancellation
                    } as any,
                })
                fastify.log.info(`Stripe: Firm ${firmId} subscription cancelled. Plan reverted to STANDARD.`)
            }
        }

        return { received: true }
    })

    /**
     * PATCH /api/stripe/firm/:id
     * Update firm settings (e.g., allocationMode).
     */
    fastify.patch<{ Params: { id: string }, Body: { allocationMode?: string } }>('/firm/:id', async (request, reply) => {
        const { id } = request.params
        const { allocationMode } = request.body

        try {
            const firm = await prisma.firm.update({
                where: { id },
                data: {
                    ...(allocationMode && { allocationMode })
                } as any
            })
            return firm
        } catch (err: any) {
            fastify.log.error(`Failed to update firm ${id}: ${err.message}`)
            return reply.status(500).send({ error: 'Failed to update firm settings' })
        }
    })
}
