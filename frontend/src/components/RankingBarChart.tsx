import ReactECharts from 'echarts-for-react'
import { EChartsOption } from 'echarts'
import { AgentRankingItem } from '../api'

interface Props {
  data: AgentRankingItem[]
}

const RankingBarChart: React.FC<Props> = ({ data }) => {
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'value',
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.agent_name).reverse(),
    },
    series: [
      {
        name: '接待工单数',
        type: 'bar',
        data: data.map((d) => d.ticket_count).reverse(),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: '#1677ff' },
              { offset: 1, color: '#69b1ff' },
            ],
          },
          borderRadius: [0, 4, 4, 0],
        },
        label: {
          show: true,
          position: 'right',
        },
      },
    ],
  }

  return <ReactECharts option={option} style={{ height: 400 }} />
}

export default RankingBarChart
