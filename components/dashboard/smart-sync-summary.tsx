'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  BarChart3, 
  Filter, 
  Search, 
  Download, 
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  TrendingUp,
  Layers
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FileAnalysisSummary {
  originalName: string
  suggestedName: string
  confidence: number
  reasoning: string
  selected: boolean
  edited: boolean
}

interface SmartSyncSummaryProps {
  analyses: FileAnalysisSummary[]
  onSelectionChange: (indices: number[]) => void
  onApplyRenames: () => void
  onExportSummary: (format: 'csv' | 'json') => void
  isRenaming?: boolean
}

export function SmartSyncSummary({
  analyses,
  onSelectionChange,
  onApplyRenames,
  onExportSummary,
  isRenaming = false
}: SmartSyncSummaryProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'byConfidence' | 'byPattern'>('overview')
  const [selectedConfidenceFilter, setSelectedConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  // Calculate statistics
  const stats = useMemo(() => {
    const selected = analyses.filter(a => a.selected)
    const avgConfidence = selected.length > 0
      ? selected.reduce((sum, a) => sum + a.confidence, 0) / selected.length
      : 0

    const confidenceGroups = {
      high: analyses.filter(a => a.confidence >= 0.8),
      medium: analyses.filter(a => a.confidence >= 0.5 && a.confidence < 0.8),
      low: analyses.filter(a => a.confidence < 0.5)
    }

    // Find common patterns in suggestions
    const patterns = new Map<string, number>()
    analyses.forEach(a => {
      // Extract patterns like date formats, numbering, etc.
      const datePattern = a.suggestedName.match(/\d{4}-\d{2}-\d{2}/)
      if (datePattern) {
        patterns.set('date-format', (patterns.get('date-format') || 0) + 1)
      }
      
      const numberPattern = a.suggestedName.match(/-\d+\./)
      if (numberPattern) {
        patterns.set('numbered', (patterns.get('numbered') || 0) + 1)
      }
      
      // Check for kebab-case
      if (a.suggestedName.includes('-') && !a.originalName.includes('-')) {
        patterns.set('kebab-case', (patterns.get('kebab-case') || 0) + 1)
      }
    })

    return {
      total: analyses.length,
      selected: selected.length,
      avgConfidence,
      confidenceGroups,
      patterns: Array.from(patterns.entries()).sort((a, b) => b[1] - a[1])
    }
  }, [analyses])

  // Filter analyses based on search and confidence
  const filteredAnalyses = useMemo(() => {
    let filtered = analyses

    if (searchQuery) {
      filtered = filtered.filter(a => 
        a.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.suggestedName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    if (selectedConfidenceFilter !== 'all') {
      filtered = filtered.filter(a => {
        if (selectedConfidenceFilter === 'high') return a.confidence >= 0.8
        if (selectedConfidenceFilter === 'medium') return a.confidence >= 0.5 && a.confidence < 0.8
        if (selectedConfidenceFilter === 'low') return a.confidence < 0.5
        return true
      })
    }

    return filtered
  }, [analyses, searchQuery, selectedConfidenceFilter])

  // Handle bulk selection
  const handleBulkSelect = (type: 'all' | 'none' | 'high' | 'medium' | 'low') => {
    let indicesToSelect: number[] = []

    switch (type) {
      case 'all':
        indicesToSelect = filteredAnalyses.map((_, i) => i)
        break
      case 'none':
        indicesToSelect = []
        break
      case 'high':
        indicesToSelect = analyses
          .map((a, i) => a.confidence >= 0.8 ? i : -1)
          .filter(i => i !== -1)
        break
      case 'medium':
        indicesToSelect = analyses
          .map((a, i) => a.confidence >= 0.5 && a.confidence < 0.8 ? i : -1)
          .filter(i => i !== -1)
        break
      case 'low':
        indicesToSelect = analyses
          .map((a, i) => a.confidence < 0.5 ? i : -1)
          .filter(i => i !== -1)
        break
    }

    onSelectionChange(indicesToSelect)
  }

  return (
    <div className="space-y-4">
      {/* Compact Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{stats.total}</p>
            </div>
            <FileText className="h-5 w-5 text-muted-foreground/50" />
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="text-lg font-bold">{stats.selected}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-green-500/50" />
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Avg Conf</p>
              <p className="text-lg font-bold">{(stats.avgConfidence * 100).toFixed(0)}%</p>
            </div>
            <TrendingUp className="h-5 w-5 text-blue-500/50" />
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Patterns</p>
              <p className="text-lg font-bold">{stats.patterns.length}</p>
            </div>
            <Layers className="h-5 w-5 text-purple-500/50" />
          </div>
        </Card>
      </div>

      {/* Compact Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExportSummary('csv')}
            className="h-8 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExportSummary('json')}
            className="h-8 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            JSON
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="byConfidence">By Confidence</TabsTrigger>
          <TabsTrigger value="byPattern">By Pattern</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          {/* Quick Actions */}
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Quick Actions</h4>
              <Button 
                onClick={onApplyRenames}
                disabled={isRenaming || stats.selected === 0}
                size="sm"
                className="h-7 text-xs"
              >
                Apply {stats.selected} Renames
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="sm" onClick={() => handleBulkSelect('all')} className="h-7 text-xs">
                All
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkSelect('none')} className="h-7 text-xs">
                None
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkSelect('high')} className="h-7 text-xs">
                High Conf
              </Button>
            </div>
          </Card>

          {/* Compact Confidence Stats */}
          <Card className="p-3">
            <h4 className="text-sm font-semibold mb-2">Confidence Distribution</h4>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-xs flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    High (≥80%)
                  </span>
                  <span className="text-xs font-medium">{stats.confidenceGroups.high.length}</span>
                </div>
                <Progress 
                  value={(stats.confidenceGroups.high.length / stats.total) * 100} 
                  className="h-1.5"
                />
              </div>
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-xs flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    Medium (50-79%)
                  </span>
                  <span className="text-xs font-medium">{stats.confidenceGroups.medium.length}</span>
                </div>
                <Progress 
                  value={(stats.confidenceGroups.medium.length / stats.total) * 100} 
                  className="h-1.5"
                />
              </div>
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-xs flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    Low (&lt;50%)
                  </span>
                  <span className="text-xs font-medium">{stats.confidenceGroups.low.length}</span>
                </div>
                <Progress 
                  value={(stats.confidenceGroups.low.length / stats.total) * 100} 
                  className="h-1.5"
                />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="byConfidence" className="space-y-3">
          {/* Compact Confidence Filter */}
          <div className="flex flex-wrap gap-1">
            <Button
              variant={selectedConfidenceFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidenceFilter('all')}
              className="h-7 text-xs"
            >
              All ({stats.total})
            </Button>
            <Button
              variant={selectedConfidenceFilter === 'high' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidenceFilter('high')}
              className="h-7 text-xs"
            >
              <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
              High ({stats.confidenceGroups.high.length})
            </Button>
            <Button
              variant={selectedConfidenceFilter === 'medium' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidenceFilter('medium')}
              className="h-7 text-xs"
            >
              <div className="w-2 h-2 rounded-full bg-yellow-500 mr-1" />
              Medium ({stats.confidenceGroups.medium.length})
            </Button>
            <Button
              variant={selectedConfidenceFilter === 'low' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedConfidenceFilter('low')}
              className="h-7 text-xs"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 mr-1" />
              Low ({stats.confidenceGroups.low.length})
            </Button>
          </div>

          {/* Filtered Results Count */}
          <p className="text-xs text-muted-foreground">
            Showing {filteredAnalyses.length} of {stats.total} files
          </p>
        </TabsContent>

        <TabsContent value="byPattern" className="space-y-3">
          <Card className="p-3">
            <h4 className="text-sm font-semibold mb-2">Common Patterns Detected</h4>
            {stats.patterns.length > 0 ? (
              <div className="space-y-1.5">
                {stats.patterns.map(([pattern, count]) => (
                  <div key={pattern} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs h-5">
                        {pattern.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {count} files
                      </span>
                    </div>
                    <Progress value={(count / stats.total) * 100} className="w-16 h-1.5" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No common patterns detected</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}