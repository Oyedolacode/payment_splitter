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

        const pricing: Record<string, { name: string, amount: number, desc: string }> = {
            standard: {
                name: 'PaySplit Standard',
                amount: 14900,
                desc: 'Essential payment splitting for small firms'
            },
            professional: {
                name: 'PaySplit Professional',
                amount: 34900,
                desc: 'Full automation and audit history'
            },
            practice: {
                name: 'PaySplit Practice',
                amount: 79900,
                desc: 'Enterprise-grade features for large practices'
            }
        }

        const selectedPricing = pricing[tier] || pricing.professional

        const firm = await prisma.firm.findUnique({ where: { id: firmId } })
        if (!firm) {
            return reply.status(404).send({ error: 'Firm not found' })
        }

        // Check if or create Stripe customer
        let customerId = (firm as any).stripeCustomerId
        if (!customerId) {
            const customer = await stripe.customers.create({
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
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${selectedPricing.name} — Monthly Subscription`,
                            description: selectedPricing.desc,
                        },
                        unit_amount: selectedPricing.amount,
                        recurring: { interval: 'month' },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${config.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.FRONTEND_URL}/dashboard`,
            metadata: { firmId: firm.id, tier },
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

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session
            const firmId = session.metadata?.firmId
            const tier = session.metadata?.tier || 'professional'
            const subscriptionId = session.subscription as string

            if (firmId) {
                await prisma.firm.update({
                    where: { id: firmId },
                    data: {
                        isSubscribed: true,
                        plan: tier,
                        subscriptionId: subscriptionId,
                    } as any,
                })
                fastify.log.info(`Stripe: Firm ${firmId} is now subscribed to ${tier} tier.`)
            }
        }

        if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object as Stripe.Subscription
            const firmId = subscription.metadata?.firmId

            if (firmId) {
                await prisma.firm.update({
                    where: { id: firmId },
                    data: {
                        isSubscribed: false,
                        subscriptionId: null,
                    } as any,
                })
                fastify.log.info(`Stripe: Firm ${firmId} subscription cancelled.`)
            }
        }

        return { received: true }
    })
}
