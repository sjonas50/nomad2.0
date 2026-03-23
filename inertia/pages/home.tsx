import { Head } from '@inertiajs/react'
import AppLayout from '~/layouts/app_layout'

export default function Home() {
  return (
    <AppLayout>
      <Head title="Chat" />
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">The Attic AI</h1>
          <p className="mt-2 text-gray-400">Chat interface coming in Phase 1</p>
        </div>
      </div>
    </AppLayout>
  )
}
