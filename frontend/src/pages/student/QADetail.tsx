import { Typography, Card, Empty } from 'antd'
import { useParams } from 'react-router-dom'

const { Title, Paragraph } = Typography

export default function QADetail() {
  const { id } = useParams<{ id: string }>()

  return (
    <div>
      <Title level={2}>问答详情</Title>
      <Paragraph type="secondary">问答 ID: {id}</Paragraph>
      <Card style={{ marginTop: 16 }}>
        <Empty description="暂无问答详情" />
      </Card>
    </div>
  )
}
