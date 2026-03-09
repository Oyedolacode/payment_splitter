import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Basic protected route check
  if (pathname.startsWith('/dashboard')) {
    // In a real app, we'd check a session cookie. 
    // Since we're using localStorage for firm_id (client-side), 
    // the middleware can only do so much, but we can check for a query param 
    // or a specialized cookie if we had one.
    // For now, let's just ensure we have security headers.
  }

  // Add some basic headers or logic as needed
  const response = NextResponse.next()
  
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  
  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
