import { useState, type KeyboardEvent } from 'react'
import { Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Search } = Input

interface SearchBarProps {
  placeholder?: string
  /** 搜索后是否跳转结果页 */
  navigateToResults?: boolean
  /** 搜索回调 */
  onSearch?: (query: string) => void
}

export default function SearchBar({
  placeholder = '输入关键词或问题开始检索...',
  navigateToResults = true,
  onSearch,
}: SearchBarProps) {
  const [value, setValue] = useState('')
  const navigate = useNavigate()

  const handleSearch = (query: string) => {
    if (!query.trim()) return
    onSearch?.(query)
    if (navigateToResults) {
      navigate(`/student/search?q=${encodeURIComponent(query)}`)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch(value)
    }
  }

  return (
    <Search
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onSearch={handleSearch}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      enterButton={<><SearchOutlined /> 搜索</>}
      size="large"
      style={{ maxWidth: 640 }}
    />
  )
}
