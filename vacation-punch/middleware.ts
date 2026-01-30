import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isKioskUnlocked(request: NextRequest) {
  const expStr = request.cookies.get("kiosk_unlock_exp")?.value;
  if (!expStr) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return false;

  return Date.now() < exp;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const kioskAllowed = ["/schedule", "/change", "/tasks", "/vacation"];
  const path = request.nextUrl.pathname;

  if (kioskAllowed.some((p) => path.startsWith(p)) && isKioskUnlocked(request)) {
    return response;
  }

  // ✅ Protect /punch (except /punch/lock)
  if (request.nextUrl.pathname.startsWith("/punch")) {
    const path = request.nextUrl.pathname;
    const isLock = path === "/punch/lock";

    if (!isLock && !isKioskUnlocked(request)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("from", "punch");
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
  }

  // ✅ Supabase session refresh
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
