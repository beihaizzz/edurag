import { Typography, Card } from 'antd'
import { UploadOutlined } from '@ant-design/icons'

const { Title, Paragraph } = Typography

export default function TeacherHomePage() {
  return (
    <div>
      <Title level={2}>教师工作台</Title>
      <Card style={{ marginTop: 16 }}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <UploadOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4}>管理课程与文档</Title>
          <Paragraph type="secondary">
            上传课件、管理文档元数据、查看学生高频问题
          </Paragraph>
        </div>
      </Card>
    </div>
  )
}
