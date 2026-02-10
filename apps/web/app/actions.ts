'use server' // This tell Next.js: "Only run this code on the server"
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function saveGridData(gridData: any) {
  const { data, error } = await supabase
    .from('grids') // Name of your table in Supabase
    .insert([ { content: gridData } ])
  
  if (error) throw new Error(error.message)
  return data
}