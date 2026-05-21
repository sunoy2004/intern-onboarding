import * as React from "react"
import { supabase } from "@/lib/supabase"
import type { InventoryItem } from "@/lib/database.types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Package, Laptop, CreditCard, BookOpen, Shirt } from "lucide-react"

const categoryIcon: Record<string, React.ReactNode> = {
  Electronics: <Laptop className="size-4" />,
  Security: <CreditCard className="size-4" />,
  Stationery: <BookOpen className="size-4" />,
  Merchandise: <Shirt className="size-4" />,
  Furniture: <Package className="size-4" />,
}

export default function InventoryPage() {
  const [items, setItems] = React.useState<InventoryItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    supabase.from("inventory_items").select("*").order("category").then(({ data }) => {
      setItems(data || [])
      setLoading(false)
    })
  }, [])

  const totalItems = items.length
  const mandatory = items.filter((i) => i.is_mandatory).length
  const lowStock = items.filter((i) => i.stock_count < 5).length

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="scroll-m-20 text-2xl font-bold tracking-tight text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">Track items available for intern allotment</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Items", value: totalItems, color: "text-foreground" },
          { label: "Mandatory Items", value: mandatory, color: "text-amber-600 dark:text-amber-400" },
          { label: "Low Stock (<5)", value: lowStock, color: "text-destructive" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              {loading ? <Skeleton className="h-8 w-12 mb-1" /> : (
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              )}
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory Catalog</CardTitle>
          <CardDescription className="text-xs">All items available for intern onboarding allotment</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0 p-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24 ml-auto" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          {categoryIcon[item.category] ?? <Package className="size-4" />}
                        </div>
                        <span className="font-medium text-foreground">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.category}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{item.description || "—"}</TableCell>
                    <TableCell>
                      <span className={`font-medium text-sm ${item.stock_count < 5 ? "text-destructive" : item.stock_count < 10 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                        {item.stock_count}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.is_mandatory ? (
                        <Badge variant="default" className="text-xs">Mandatory</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
