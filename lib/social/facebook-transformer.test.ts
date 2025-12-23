/**
 * Test/Dev helper for Facebook transformer
 * 
 * Run this in dev mode to verify the transformer output shape
 */

import { buildFacebookAnalysis } from './facebook-transformer'
import type { FacebookPost } from './facebook-types'

/**
 * Sample test data - run this in console or dev mode
 */
export function testFacebookTransformer() {
  const samplePosts: FacebookPost[] = [
    {
      facebookUrl: 'https://www.facebook.com/test',
      postId: '1',
      url: 'https://www.facebook.com/test/posts/1',
      topLevelUrl: 'https://www.facebook.com/test',
      time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      isVideo: true,
      text: 'Check out our new product! Visit our website to learn more.',
      likes: 150,
      comments: 20,
      shares: 10,
      viewsCount: 5000,
      thumbnailUrl: 'https://example.com/thumb1.jpg',
      pageName: 'Test Page',
      profilePic: null,
    },
    {
      facebookUrl: 'https://www.facebook.com/test',
      postId: '2',
      url: 'https://www.facebook.com/test/posts/2',
      topLevelUrl: 'https://www.facebook.com/test',
      time: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      isVideo: false,
      text: 'Just a regular photo post',
      likes: 50,
      comments: 5,
      shares: 2,
      viewsCount: null,
      thumbnailUrl: 'https://example.com/thumb2.jpg',
      pageName: 'Test Page',
      profilePic: null,
    },
    {
      facebookUrl: 'https://www.facebook.com/test',
      postId: '3',
      url: 'https://www.facebook.com/test/posts/3',
      topLevelUrl: 'https://www.facebook.com/test',
      time: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
      isVideo: false,
      text: 'https://example.com/external-link',
      likes: 30,
      comments: 2,
      shares: 1,
      viewsCount: null,
      thumbnailUrl: null,
      pageName: 'Test Page',
      profilePic: null,
    },
  ]

  const result = buildFacebookAnalysis(samplePosts, 'Test Page', new Date(), 30)
  
  console.log('Facebook Transformer Test Output:')
  console.log(JSON.stringify(result, null, 2))
  
  return result
}

// Export for use in dev console: testFacebookTransformer()

