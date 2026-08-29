import Link from 'next/link'
import { Compass } from 'lucide-react'
import { LogoMark } from '@/components/layout/logo'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <LogoMark className="size-10" />
      <EmptyState
        icon={<Compass />}
        title="That page does not exist"
        description="The link may be out of date, or the section may not have been built yet."
        action={
          <Link href="/dashboard" className={buttonVariants()}>
            Go to the dashboard
          </Link>
        }
      />
    </main>
  )
}
