/**
 * Facebook Analysis Transformer
 * 
 * Converts Facebook posts into the shared SocialChannelAnalysis format
 */

import type { FacebookPost } from './facebook-types'
import type { SocialChannelAnalysis, SocialOpportunity, Priority } from './shared-types'

/**
 * Detect if a post has a CTA (simple keyword-based detection)
 */
function hasCTA(text: string | null): boolean {
  if (!text) return false
  const ctaKeywords = [
    '👇', '👉', 'link', 'shop', "don't miss", "don't miss out", 'check out', 'read', 'learn more',
    'visit', 'call', 'book', 'order', 'buy', 'sign up', 'register', 'download', 'get started',
    'contact', 'message', 'click here', 'link in bio', 'link below', 'swipe up', 'tap', 'try now'
  ]
  const lowerText = text.toLowerCase()
  return ctaKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()))
}

/**
 * Classify post type
 */
function classifyPostType(post: FacebookPost): 'video' | 'photo' | 'link' {
  // Priority: video > photo > link
  if (post.isVideo) return 'video'
  
  // For now, we don't have media array in FacebookPost type
  // But we can infer from other fields
  // If it has a link preview or external link indicators, it's a link
  if (post.text && (post.text.includes('http') || post.text.includes('www.'))) {
    return 'link'
  }
  
  // Default to photo if not video and no clear link
  return 'photo'
}

/**
 * Build Facebook analysis from posts
 */
export function buildFacebookAnalysis(
  posts: FacebookPost[],
  pageName?: string | null,
  now: Date = new Date(),
  windowDays: number = 30
): SocialChannelAnalysis {
  if (posts.length === 0) {
    return {
      platform: 'facebook',
      handleLabel: pageName || 'Facebook Page',
      statsBadges: [
        { label: 'Posts analyzed', value: '0' },
        { label: 'Posts in last 30 days', value: '0' },
        { label: 'Avg interactions/post', value: '0' },
      ],
      summaryLine: 'No posts found to analyze.',
      whatsWorkingBullets: [],
      risksBullets: [],
      opportunities: [],
    }
  }

  // Filter posts within window
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const postsInWindow = posts.filter(p => {
    const postDate = new Date(p.time)
    return postDate >= windowStart
  })

  // Calculate basic stats
  const postsAnalyzed = posts.length
  const postsInWindowCount = postsInWindow.length
  const postingRatePerWeek = postsInWindowCount > 0 
    ? (postsInWindowCount / windowDays) * 7 
    : 0

  // Calculate engagement metrics
  const allInteractions = posts.map(p => (p.likes || 0) + (p.comments || 0) + (p.shares || 0))
  const avgInteractionsPerPost = allInteractions.length > 0
    ? allInteractions.reduce((sum, val) => sum + val, 0) / allInteractions.length
    : 0
  
  const sortedInteractions = [...allInteractions].sort((a, b) => b - a)
  const medianInteractions = sortedInteractions.length > 0
    ? sortedInteractions[Math.floor(sortedInteractions.length / 2)]
    : 0

  // Find top post by interactions
  const topPostByInteractions = posts.reduce((top, post) => {
    const interactions = (post.likes || 0) + (post.comments || 0) + (post.shares || 0)
    const topInteractions = (top.likes || 0) + (top.comments || 0) + (top.shares || 0)
    return interactions > topInteractions ? post : top
  }, posts[0])

  const avgCommentsPerPost = posts.length > 0
    ? posts.reduce((sum, p) => sum + (p.comments || 0), 0) / posts.length
    : 0

  // Video stats
  const videoPosts = posts.filter(p => p.isVideo)
  const videoPostsWithViews = videoPosts.filter(p => p.viewsCount !== null && p.viewsCount !== undefined)
  const avgViewsPerVideo = videoPostsWithViews.length > 0
    ? videoPostsWithViews.reduce((sum, p) => sum + (p.viewsCount || 0), 0) / videoPostsWithViews.length
    : 0

  // Post type classification
  const postsByType = {
    video: posts.filter(p => classifyPostType(p) === 'video'),
    photo: posts.filter(p => classifyPostType(p) === 'photo'),
    link: posts.filter(p => classifyPostType(p) === 'link'),
  }

  // Calculate engagement by type
  const avgInteractionsByType = {
    video: postsByType.video.length > 0
      ? postsByType.video.reduce((sum, p) => sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0) / postsByType.video.length
      : 0,
    photo: postsByType.photo.length > 0
      ? postsByType.photo.reduce((sum, p) => sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0) / postsByType.photo.length
      : 0,
    link: postsByType.link.length > 0
      ? postsByType.link.reduce((sum, p) => sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0) / postsByType.link.length
      : 0,
  }

  // CTA detection
  const postsWithCTA = posts.filter(p => hasCTA(p.text))
  const ctaRate = posts.length > 0 ? (postsWithCTA.length / posts.length) * 100 : 0

  // Top posts (top 20% by interactions)
  const top20PercentCount = Math.max(1, Math.floor(posts.length * 0.2))
  const topPosts = [...posts]
    .sort((a, b) => {
      const aInteractions = (a.likes || 0) + (a.comments || 0) + (a.shares || 0)
      const bInteractions = (b.likes || 0) + (b.comments || 0) + (b.shares || 0)
      return bInteractions - aInteractions
    })
    .slice(0, top20PercentCount)
  
  const topPostsInteractions = topPosts.reduce((sum, p) => 
    sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0
  )
  const totalInteractions = posts.reduce((sum, p) => 
    sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0
  )
  const topPostsContribution = totalInteractions > 0 
    ? (topPostsInteractions / totalInteractions) * 100 
    : 0

  // Shares analysis
  const avgSharesByType = {
    video: postsByType.video.length > 0
      ? postsByType.video.reduce((sum, p) => sum + (p.shares || 0), 0) / postsByType.video.length
      : 0,
    photo: postsByType.photo.length > 0
      ? postsByType.photo.reduce((sum, p) => sum + (p.shares || 0), 0) / postsByType.photo.length
      : 0,
    link: postsByType.link.length > 0
      ? postsByType.link.reduce((sum, p) => sum + (p.shares || 0), 0) / postsByType.link.length
      : 0,
  }

  // Format mix
  const formatMix = {
    video: postsByType.video.length,
    photo: postsByType.photo.length,
    link: postsByType.link.length,
  }
  const totalFormats = formatMix.video + formatMix.photo + formatMix.link
  const dominantFormat = formatMix.video > formatMix.photo && formatMix.video > formatMix.link ? 'video'
    : formatMix.photo > formatMix.link ? 'photo' : 'link'
  const dominantFormatShare = totalFormats > 0 
    ? ((formatMix[dominantFormat] / totalFormats) * 100) 
    : 0

  // Find posts with near-zero engagement
  const deadPosts = posts.filter(p => {
    const interactions = (p.likes || 0) + (p.comments || 0) + (p.shares || 0)
    return interactions < 5 // Threshold for "dead" posts
  })

  // Build summary line
  const topPostInteractions = (topPostByInteractions.likes || 0) + (topPostByInteractions.comments || 0) + (topPostByInteractions.shares || 0)
  const summaryLine = `Posting ${postingRatePerWeek.toFixed(1)}x/week, avg ${Math.round(avgInteractionsPerPost)} interactions/post. Top post: ${topPostInteractions} interactions. Avg ${Math.round(avgCommentsPerPost)} comments/post.`

  // Build "What's working" bullets (max 3)
  const whatsWorking: string[] = []
  
  if (avgInteractionsByType.video > avgInteractionsPerPost * 1.1 && postsByType.video.length > 0) {
    const lift = ((avgInteractionsByType.video - avgInteractionsPerPost) / avgInteractionsPerPost) * 100
    whatsWorking.push(`Video posts are your engine — they outperform photos/links by ${Math.round(lift)}%`)
  }
  
  if (topPostsContribution > 60) {
    whatsWorking.push(`Your hits really hit — top 20% of posts drive ${Math.round(topPostsContribution)}% of engagement`)
  }
  
  if (postingRatePerWeek >= 3) {
    whatsWorking.push(`Consistent cadence keeps you top-of-feed — ${postingRatePerWeek.toFixed(1)} posts/week`)
  }
  
  // Check for shareability
  const bestShareFormat = Object.entries(avgSharesByType).reduce((best, [type, avg]) => {
    return avg > best.avg ? { type, avg } : best
  }, { type: 'video', avg: 0 })
  
  if (bestShareFormat.avg > avgInteractionsPerPost * 0.3 && postsByType[bestShareFormat.type as keyof typeof postsByType].length > 0) {
    whatsWorking.push(`Shareability is high on ${bestShareFormat.type} posts — that's free reach`)
  }

  // Build "Risks & blind spots" bullets (max 3)
  const risks: string[] = []
  
  if (postsByType.link.length >= 3 && avgInteractionsByType.link < avgInteractionsPerPost * 0.4) {
    risks.push(`External link posts are getting throttled — consider 'native first' + link in comments`)
  }
  
  if (ctaRate < 40) {
    risks.push(`Captions are missing clear next steps — only ${Math.round(ctaRate)}% have CTAs, you're leaving clicks on the table`)
  }
  
  // Check for high comment volume (potential reputation risk)
  const highCommentPosts = posts.filter(p => (p.comments || 0) >= avgCommentsPerPost * 3)
  const totalCommentsInWindow = postsInWindow.reduce((sum, p) => sum + (p.comments || 0), 0)
  if (highCommentPosts.length > 0 || totalCommentsInWindow > 50) {
    risks.push(`High comment volume = reputation risk unless triaged fast — ${highCommentPosts.length} posts with 3x+ avg comments`)
  }
  
  if (dominantFormatShare > 80) {
    risks.push(`Over-reliance on ${dominantFormat} format (${Math.round(dominantFormatShare)}%) — diversify to reduce fatigue`)
  }
  
  if (deadPosts.length > 0 && deadPosts.length / posts.length > 0.2) {
    risks.push(`${deadPosts.length} posts are dead-on-arrival (<5 interactions) — diagnose timing/creative`)
  }

  // Build opportunities
  const opportunities: SocialOpportunity[] = []

  // Opportunity A: Link posts underperforming
  if (postsByType.link.length >= 3 && avgInteractionsByType.link < avgInteractionsPerPost * 0.4) {
    const linkPosts = postsByType.link
      .sort((a, b) => {
        const aInteractions = (a.likes || 0) + (a.comments || 0) + (a.shares || 0)
        const bInteractions = (b.likes || 0) + (b.comments || 0) + (b.shares || 0)
        return aInteractions - bInteractions // Sort ascending to show worst performers
      })
      .slice(0, 2)
    
    opportunities.push({
      id: 'link-posts-underperforming',
      title: 'Link posts are underperforming',
      priority: 'high',
      description: `Your link posts average ${Math.round(avgInteractionsByType.link)} interactions, which is ${Math.round((1 - avgInteractionsByType.link / avgInteractionsPerPost) * 100)}% below your overall average. Facebook's algorithm throttles external links.`,
      evidenceTitle: 'Evidence',
      evidenceBullets: [
        `Link posts: ${Math.round(avgInteractionsByType.link)} avg interactions vs ${Math.round(avgInteractionsPerPost)} overall`,
        `${postsByType.link.length} link posts analyzed`,
        `Performance gap: ${Math.round((1 - avgInteractionsByType.link / avgInteractionsPerPost) * 100)}% below average`,
      ],
      examplePosts: linkPosts.map(p => ({
        postId: p.postId,
        url: p.url,
        thumbnail: p.thumbnailUrl,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
      })),
      solutions: ['socialStudio', 'insightsLab'],
    })
  }

  // Opportunity B: Turn engagement into action
  if (ctaRate < 40 || (posts.filter(p => (p.likes || 0) > avgInteractionsPerPost * 1.5 && !hasCTA(p.text)).length > 0)) {
    const highLikeNoCTAPosts = posts
      .filter(p => (p.likes || 0) > avgInteractionsPerPost * 1.5 && !hasCTA(p.text))
      .slice(0, 2)
    
    opportunities.push({
      id: 'turn-engagement-into-action',
      title: 'Turn engagement into action',
      priority: 'medium',
      description: `Only ${Math.round(ctaRate)}% of your posts include clear calls-to-action. High-engagement posts without CTAs are leaving clicks on the table.`,
      evidenceTitle: 'Evidence',
      evidenceBullets: [
        `${Math.round(ctaRate)}% of posts have CTAs (target: 40%+)`,
        `${posts.filter(p => (p.likes || 0) > avgInteractionsPerPost * 1.5 && !hasCTA(p.text)).length} high-engagement posts missing CTAs`,
        `Avg interactions: ${Math.round(avgInteractionsPerPost)}/post`,
      ],
      examplePosts: highLikeNoCTAPosts.map(p => ({
        postId: p.postId,
        url: p.url,
        thumbnail: p.thumbnailUrl,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
      })),
      solutions: ['socialStudio'],
    })
  }

  // Opportunity C: Comment volume needs triage
  if (highCommentPosts.length > 0 || totalCommentsInWindow > 50) {
    opportunities.push({
      id: 'comment-volume-triage',
      title: 'Comment volume needs triage',
      priority: totalCommentsInWindow > 100 ? 'high' : 'medium',
      description: `You have ${highCommentPosts.length} posts with 3x+ average comments, and ${totalCommentsInWindow} total comments in the last ${windowDays} days. Unanswered comments hurt reputation.`,
      evidenceTitle: 'Evidence',
      evidenceBullets: [
        `${highCommentPosts.length} posts with ${Math.round(avgCommentsPerPost * 3)}+ comments`,
        `${totalCommentsInWindow} total comments in last ${windowDays} days`,
        `Avg comments/post: ${Math.round(avgCommentsPerPost)}`,
      ],
      examplePosts: highCommentPosts.slice(0, 2).map(p => ({
        postId: p.postId,
        url: p.url,
        thumbnail: p.thumbnailUrl,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
      })),
      solutions: ['reputationHub'],
    })
  }

  // Opportunity D: Double down on top format (video or photo)
  const bestFormat = avgInteractionsByType.video > avgInteractionsByType.photo ? 'video' : 'photo'
  const bestFormatAvg = avgInteractionsByType[bestFormat]
  const bestFormatPosts = postsByType[bestFormat]
  
  if (bestFormatAvg > avgInteractionsPerPost * 1.2 && bestFormatPosts.length < posts.length * 0.3) {
    const topFormatPosts = bestFormatPosts
      .sort((a, b) => {
        const aInteractions = (a.likes || 0) + (a.comments || 0) + (a.shares || 0)
        const bInteractions = (b.likes || 0) + (b.comments || 0) + (b.shares || 0)
        return bInteractions - aInteractions
      })
      .slice(0, 2)
    
    opportunities.push({
      id: `double-down-on-${bestFormat}`,
      title: 'Double down on top format',
      priority: 'medium',
      description: `${bestFormat.charAt(0).toUpperCase() + bestFormat.slice(1)} posts drive ${Math.round(((bestFormatAvg - avgInteractionsPerPost) / avgInteractionsPerPost) * 100)}% more engagement, but only ${Math.round((bestFormatPosts.length / posts.length) * 100)}% of your content is ${bestFormat}.`,
      evidenceTitle: 'Evidence',
      evidenceBullets: [
        `${bestFormat.charAt(0).toUpperCase() + bestFormat.slice(1)} avg: ${Math.round(bestFormatAvg)} interactions vs ${Math.round(avgInteractionsPerPost)} overall`,
        `Only ${bestFormatPosts.length} ${bestFormat} posts (${Math.round((bestFormatPosts.length / posts.length) * 100)}% of content)`,
        `Lift: ${Math.round(((bestFormatAvg - avgInteractionsPerPost) / avgInteractionsPerPost) * 100)}%`,
      ],
      examplePosts: topFormatPosts.map(p => ({
        postId: p.postId,
        url: p.url,
        thumbnail: p.thumbnailUrl,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
      })),
      solutions: ['socialStudio'],
    })
  }

  // Limit opportunities to 6 max
  const finalOpportunities = opportunities.slice(0, 6)

  return {
    platform: 'facebook',
    handleLabel: pageName || 'Facebook Page',
    statsBadges: [
      { label: 'Posts analyzed', value: postsAnalyzed.toString() },
      { label: 'Posts in last 30 days', value: postsInWindowCount.toString() },
      { label: 'Avg interactions/post', value: Math.round(avgInteractionsPerPost).toString() },
    ],
    summaryLine,
    whatsWorkingBullets: whatsWorking.slice(0, 3),
    risksBullets: risks.slice(0, 3),
    opportunities: finalOpportunities,
  }
}

