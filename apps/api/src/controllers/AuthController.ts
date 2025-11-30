import { Body, Controller, Post, Route, Tags, SuccessResponse } from 'tsoa'

interface LoginRequest {
  username: string
  password: string
}

interface RegisterRequest {
  username: string
  password: string
  displayName: string
}

interface AuthResponse {
  token: string
  user: {
    profileName: string
    displayName: string
  }
}

@Route('auth')
@Tags('Authentication')
export class AuthController extends Controller {
  @Post('login')
  @SuccessResponse('200', 'Login successful')
  public async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    // TODO: Implement actual authentication
    return {
      token: 'jwt-token-here',
      user: {
        profileName: body.username,
        displayName: body.username,
      },
    }
  }

  @Post('register')
  @SuccessResponse('201', 'Registration successful')
  public async register(@Body() body: RegisterRequest): Promise<AuthResponse> {
    this.setStatus(201)
    // TODO: Implement actual registration
    return {
      token: 'jwt-token-here',
      user: {
        profileName: body.username,
        displayName: body.displayName,
      },
    }
  }
}
