'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

interface PostTypeChartProps {
  data: Array<{ name: string; value: number; fill: string }>
}

export default function PostTypeChart({ data }: PostTypeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis dataKey="name" style={{ fontFamily: 'var(--font-roboto-stack)', fontSize: '12px' }} />
        <YAxis style={{ fontFamily: 'var(--font-roboto-stack)', fontSize: '12px' }} />
        <Tooltip />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

