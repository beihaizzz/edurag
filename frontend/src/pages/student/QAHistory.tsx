import { Typography, Card, Empty } from 'antd'

const { Title } = Typography

export default function QAHistory() {
  return (
    <div>
      <Title level={2}>问答历史</Title>
      <Card style={{ marginTop: 16 }}>
        <Empty description="暂无问答记录" />
      </Card>
    </div>
  )
}
