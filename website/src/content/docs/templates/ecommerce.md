---
title: E-commerce Template
description: Digital products store with Stripe, shopping cart, checkout, and order management
---

Digital products e-commerce store with Stripe products catalog, shopping cart, checkout, order management, and Vue 3 frontend.

## Quick Start

```bash
# Create project
stacksolo init --template ecommerce

# Install dependencies
cd my-store
npm install

# Set up Stripe secrets
echo "sk_test_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-

# Start development
stacksolo dev
```

## What's Included

### Frontend (Vue 3)
- Firebase SDK for authentication (email/password, Google)
- Pinia stores for auth, cart, and products
- Vue Router with protected routes
- Tailwind CSS styling
- Homepage with featured products
- Product catalog and detail pages
- Persistent shopping cart with drawer
- Checkout flow with Stripe
- Order history and detail pages

### Backend
- Express API on Cloud Functions
- Stripe integration for products and checkout
- PostgreSQL with Drizzle ORM
- Cart, Orders, Webhooks routes
- Webhook handler for order completion

## Project Structure

```
├── apps/web/                    # Vue 3 frontend
│   └── src/
│       ├── components/
│       │   ├── Navbar.vue
│       │   ├── ProductCard.vue
│       │   └── CartDrawer.vue
│       ├── stores/
│       │   ├── auth.ts
│       │   ├── cart.ts
│       │   └── products.ts
│       ├── pages/
│       │   ├── Home.vue
│       │   ├── Products.vue
│       │   ├── Product.vue
│       │   ├── Cart.vue
│       │   ├── Orders.vue
│       │   ├── Order.vue
│       │   ├── Login.vue
│       │   └── CheckoutSuccess.vue
│       ├── router/index.ts
│       └── lib/
│           ├── firebase.ts
│           └── api.ts

├── functions/api/               # Express API
│   └── src/
│       ├── db/
│       │   ├── index.ts         # Drizzle connection
│       │   └── schema.ts        # User, Cart, Order tables
│       ├── services/
│       │   └── stripe.service.ts
│       ├── routes/
│       │   ├── products.ts      # Stripe products
│       │   ├── cart.ts          # Cart CRUD
│       │   ├── checkout.ts      # Stripe checkout
│       │   ├── orders.ts        # Order history
│       │   └── webhooks.ts      # Stripe webhooks
│       └── index.ts

└── stacksolo.config.json
```

## Database Schema

```typescript
// users - synced from Firebase Auth
export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// cart_items - persistent shopping cart
export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  priceId: varchar('price_id', { length: 255 }).notNull(),
  productId: varchar('product_id', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// orders - completed orders from Stripe
export const orders = pgTable('orders', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  totalAmount: integer('total_amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  stripeCheckoutId: varchar('stripe_checkout_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// order_items - line items in orders
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull(),
  productId: varchar('product_id', { length: 255 }).notNull(),
  productName: varchar('product_name', { length: 255 }).notNull(),
  productDescription: text('product_description'),
  priceId: varchar('price_id', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull(),
  unitAmount: integer('unit_amount').notNull(),
  downloadUrl: varchar('download_url', { length: 500 }),
});
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Health check |
| GET | /api/products | No | List Stripe products |
| GET | /api/products/:id | No | Get product details |
| GET | /api/cart | Yes | Get user's cart |
| POST | /api/cart | Yes | Add item to cart |
| PUT | /api/cart/:id | Yes | Update cart item quantity |
| DELETE | /api/cart/:id | Yes | Remove item from cart |
| DELETE | /api/cart | Yes | Clear entire cart |
| POST | /api/checkout | Yes | Create Stripe checkout session |
| GET | /api/orders | Yes | List user's orders |
| GET | /api/orders/:id | Yes | Get order details |
| POST | /api/webhooks/stripe | No* | Handle Stripe webhooks |

*Verified by Stripe signature

## Stripe Setup

1. **Create Stripe account** at https://stripe.com
2. **Create products** in Stripe Dashboard:
   - Add product name, description, images
   - Add price (one-time payment)
   - Products appear automatically in the store
3. **Create secrets**:

```bash
echo "sk_test_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-
```

## Stripe Webhook Events

The webhook handler processes:
- `checkout.session.completed` - Creates order, clears cart
- `checkout.session.expired` - Marks order as expired

## Frontend Pages

| Route | Page | Auth Required |
|-------|------|---------------|
| `/` | Homepage with featured products | No |
| `/products` | Product catalog | No |
| `/products/:id` | Product detail | No |
| `/cart` | Shopping cart | Yes |
| `/orders` | Order history | Yes |
| `/orders/:id` | Order detail | Yes |
| `/login` | Login page | No |
| `/checkout/success` | Post-checkout confirmation | Yes |

## Customization

### Adding Digital Downloads

Update webhook handler to include download URLs:

```typescript
// In routes/webhooks.ts
const downloadUrl = await generateSignedUrl(item.productId);
await db.insert(orderItems).values({
  ...itemData,
  downloadUrl,
});
```

### Adding Shipping (Physical Products)

1. Add shipping address fields to checkout
2. Update Stripe checkout to collect shipping
3. Add fulfillment status to orders table

### Adding Inventory

1. Add quantity tracking to products (Stripe metadata)
2. Check availability before checkout
3. Decrement on order completion

## Environment Variables

For local development, create `.env.local`:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

## Deployment

```bash
stacksolo deploy

# After deployment, set up Stripe webhook in Dashboard:
# URL: https://your-domain.com/api/webhooks/stripe
# Events: checkout.session.completed, checkout.session.expired
```

This creates:
- Cloud Functions API
- Cloud SQL PostgreSQL
- Cloud Storage for frontend
- Load balancer with SSL
