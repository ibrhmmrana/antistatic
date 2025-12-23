'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts'

interface FunnelDataPoint {
  name: string
  value: number
  fill: string
  conversionRate?: string
}

interface FunnelChartEnhancedProps {
  data: FunnelDataPoint[]
}

export default function FunnelChartEnhanced({ data }: FunnelChartEnhancedProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <XAxis type="number" hide />
        <YAxis 
          dataKey="name" 
          type="category" 
          width={100} 
          style={{ fontFamily: 'var(--font-roboto-stack)', fontSize: '12px' }} 
        />
        <Tooltip 
          formatter={(value: number, name: string, props: any) => {
            const conversionRate = props.payload.conversionRate
            return conversionRate 
              ? [`${value.toLocaleString()} (${conversionRate})`, name]
              : [value.toLocaleString(), name]
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
          <LabelList 
            dataKey="conversionRate" 
            position="right" 
            style={{ fontFamily: 'var(--font-roboto-stack)', fontSize: '11px', fill: '#64748b' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

