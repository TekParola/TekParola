pipeline {
    agent {
        docker {
            image 'node:18-alpine'
            args '-v /var/run/docker.sock:/var/run/docker.sock'
        }
    }

    environment {
        CI = 'true'
        NODE_ENV = 'test'
        DATABASE_URL = 'postgresql://postgres:postgres@postgres:5432/tekparola_test'
        REDIS_URL = 'redis://redis:6379'
        DOCKER_REGISTRY = credentials('docker-registry')
        SONAR_TOKEN = credentials('sonar-token')
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 1, unit: 'HOURS')
        timestamps()
        ansiColor('xterm')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_MSG = sh(
                        script: 'git log -1 --pretty=%B',
                        returnStdout: true
                    ).trim()
                    env.GIT_AUTHOR = sh(
                        script: "git log -1 --pretty=format:'%an'",
                        returnStdout: true
                    ).trim()
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            parallel {
                stage('ESLint') {
                    steps {
                        sh 'npm run lint'
                    }
                }
                stage('TypeScript') {
                    steps {
                        sh 'npm run typecheck'
                    }
                }
            }
        }

        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh 'npm run test:unit'
                    }
                    post {
                        always {
                            junit 'coverage/junit.xml'
                            publishHTML([
                                allowMissing: false,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'coverage/lcov-report',
                                reportFiles: 'index.html',
                                reportName: 'Coverage Report'
                            ])
                        }
                    }
                }
                stage('Integration Tests') {
                    agent {
                        docker {
                            image 'docker/compose:latest'
                            args '-v /var/run/docker.sock:/var/run/docker.sock'
                        }
                    }
                    steps {
                        sh '''
                            docker-compose -f docker-compose.test.yml up -d
                            sleep 10
                            npm run db:migrate:test
                            npm run test:integration
                        '''
                    }
                    post {
                        always {
                            sh 'docker-compose -f docker-compose.test.yml down'
                        }
                    }
                }
            }
        }

        stage('Security Scan') {
            parallel {
                stage('Dependency Check') {
                    steps {
                        sh 'npm audit --production'
                    }
                }
                stage('OWASP Dependency Check') {
                    steps {
                        dependencyCheck additionalArguments: '''
                            --scan .
                            --format JSON
                            --format HTML
                        ''',
                        odcInstallation: 'OWASP-DC'
                        
                        dependencyCheckPublisher pattern: 'dependency-check-report.json'
                    }
                }
                stage('SonarQube Analysis') {
                    steps {
                        withSonarQubeEnv('SonarQube') {
                            sh '''
                                npm run sonar-scanner \
                                    -Dsonar.projectKey=tekparola-sso \
                                    -Dsonar.sources=src \
                                    -Dsonar.tests=tests \
                                    -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                                    -Dsonar.testExecutionReportPaths=coverage/test-report.xml
                            '''
                        }
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 1, unit: 'HOURS') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build Docker Image') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    tag pattern: "v\\d+\\.\\d+\\.\\d+", comparator: "REGEXP"
                }
            }
            steps {
                script {
                    def imageName = "${DOCKER_REGISTRY}/tekparola-sso"
                    def imageTag = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
                    
                    docker.build("${imageName}:${imageTag}")
                    
                    docker.withRegistry('https://registry.hub.docker.com', 'docker-credentials') {
                        docker.image("${imageName}:${imageTag}").push()
                        
                        if (env.BRANCH_NAME == 'main') {
                            docker.image("${imageName}:${imageTag}").push('latest')
                        }
                    }
                }
            }
        }

        stage('Deploy') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            parallel {
                stage('Deploy to Staging') {
                    when {
                        branch 'develop'
                    }
                    steps {
                        script {
                            withKubeConfig([credentialsId: 'k8s-staging']) {
                                sh '''
                                    kubectl set image deployment/tekparola-sso \
                                        tekparola-sso=${DOCKER_REGISTRY}/tekparola-sso:${BRANCH_NAME}-${BUILD_NUMBER} \
                                        -n staging
                                    kubectl rollout status deployment/tekparola-sso -n staging
                                '''
                            }
                        }
                    }
                }
                stage('Deploy to Production') {
                    when {
                        branch 'main'
                    }
                    input {
                        message "Deploy to production?"
                        ok "Deploy"
                    }
                    steps {
                        script {
                            withKubeConfig([credentialsId: 'k8s-production']) {
                                sh '''
                                    kubectl set image deployment/tekparola-sso \
                                        tekparola-sso=${DOCKER_REGISTRY}/tekparola-sso:${BRANCH_NAME}-${BUILD_NUMBER} \
                                        -n production
                                    kubectl rollout status deployment/tekparola-sso -n production
                                '''
                            }
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            slackSend(
                color: 'good',
                message: "✅ Build Successful: ${env.JOB_NAME} - ${env.BUILD_NUMBER} (<${env.BUILD_URL}|Open>)"
            )
        }
        failure {
            slackSend(
                color: 'danger',
                message: "❌ Build Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER} (<${env.BUILD_URL}|Open>)"
            )
        }
    }
}
